/**
 * Cross-Instance Agent Delegation Demo
 *
 * Run with keepalive to interact with running instances after the test:
 *
 * N8N_CONTAINERS_KEEPALIVE=true N8N_AGENT_LLM_API_KEY=<key> \
 *   pnpm --filter=n8n-playwright test:container:sqlite \
 *   tests/e2e/agents/agents-a2a-demo.spec.ts --reporter=list --workers=1
 *
 * After the test finishes, containers stay alive. Use the printed curl commands.
 * Cleanup: pnpm --filter n8n-containers stack:clean:all
 */
import type { APIResponse } from '@playwright/test';
import { nanoid } from 'nanoid';

import { test, expect, agentTestConfig } from './fixtures';

test.use(agentTestConfig);

async function unwrap<T>(response: APIResponse): Promise<T> {
	const json = await response.json();
	return (json.data ?? json) as T;
}

function parseSseEvents(text: string): Array<Record<string, unknown>> {
	return text
		.split('\n')
		.filter((line) => line.startsWith('data: '))
		.map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

/**
 * The externalAgents URL is fetched by the n8n server process (inside the container).
 * Inside the container, n8n listens on port 5678. The host-mapped port (backendUrl)
 * is NOT reachable from inside the container. So we always use localhost:5678 for
 * server-to-server calls within the same container.
 *
 * When running locally (N8N_BASE_URL set), backendUrl IS the real URL and works directly.
 */
function getServerInternalUrl(backendUrl: string): string {
	// If backendUrl is already localhost:5678, we're running locally — use it as-is
	if (backendUrl.includes(':5678')) return backendUrl;
	// Container mode: n8n listens on 5678 inside the container
	return 'http://localhost:5678';
}

const DIVIDER = '='.repeat(70);

test.describe('A2A Cross-Instance Demo', () => {
	test('should delegate Agent A → Agent B over HTTP and print demo info', async ({
		agent: agentA,
		agentProject,
		agentLlmApiKey,
		api,
		backendUrl,
		ownerApiKey,
		externalRequest,
	}) => {
		test.skip(!agentLlmApiKey, 'N8N_AGENT_LLM_API_KEY not set');
		test.setTimeout(180_000);

		// URL for server-to-server calls (inside the container)
		const internalUrl = getServerInternalUrl(backendUrl);

		// Create Agent B
		const agentB = await api.agents.createAgent({
			firstName: `DocsBot-${nanoid(8)}`,
			description: 'Knowledge base manager — runs workflows and returns results',
			agentAccessLevel: 'open',
		});

		// Add both agents to the shared project
		await api.projects.addUserToProject(agentProject.id, agentA.id, 'project:editor');
		await api.projects.addUserToProject(agentProject.id, agentB.id, 'project:editor');

		// Create a workflow for Agent B
		const workflowName = `DocsBot Workflow ${nanoid(8)}`;
		const workflow = await api.workflows.createWorkflow({
			name: workflowName,
			nodes: [
				{
					id: nanoid(),
					name: 'When clicking "Test workflow"',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [250, 300],
					parameters: {},
				},
				{
					id: nanoid(),
					name: 'Set',
					type: 'n8n-nodes-base.set',
					typeVersion: 3.4,
					position: [450, 300],
					parameters: {
						assignments: {
							assignments: [
								{
									id: nanoid(),
									name: 'result',
									value: 'Hello from the remote agent!',
									type: 'string',
								},
							],
						},
					},
				},
			],
			connections: {
				'When clicking "Test workflow"': {
					main: [[{ node: 'Set', type: 'main', index: 0 }]],
				},
			},
		});
		await api.workflows.transfer(workflow.id, agentProject.id);

		// --- Run the cross-instance delegation ---
		// externalAgents URL uses internalUrl (reachable from inside the container)
		const response = await externalRequest.post(`/rest/agents/${agentA.id}/task`, {
			data: {
				prompt: `Delegate to ${agentB.firstName} to run their workflow and report the result.`,
				externalAgents: [
					{
						name: agentB.firstName,
						description: agentB.description,
						url: `${internalUrl}/rest/agents/${agentB.id}/task`,
						apiKey: ownerApiKey.rawApiKey,
					},
				],
			},
		});

		expect(response.ok()).toBe(true);
		const task = await unwrap<{
			status: string;
			summary: string;
			steps: Array<{ action: string; toAgent?: string; result?: string }>;
		}>(response);

		expect(task.status).toBe('completed');

		const delegationStep = task.steps.find(
			(s) => s.action === 'send_message' && s.toAgent === agentB.firstName,
		);
		expect(delegationStep).toBeTruthy();
		expect(delegationStep!.result).toBe('success');

		// --- Print demo info (curl commands use backendUrl — host perspective) ---
		// eslint-disable-next-line no-console
		console.log(`\n${DIVIDER}`);
		// eslint-disable-next-line no-console
		console.log('  A2A CROSS-INSTANCE DELEGATION — DEMO READY');
		// eslint-disable-next-line no-console
		console.log(DIVIDER);
		// eslint-disable-next-line no-console
		console.log(`\n  Backend URL: ${backendUrl}`);
		// eslint-disable-next-line no-console
		console.log(`  Agent A:     ${agentA.firstName} (${agentA.id})`);
		// eslint-disable-next-line no-console
		console.log(`  Agent B:     ${agentB.firstName} (${agentB.id})`);
		// eslint-disable-next-line no-console
		console.log(`  Workflow:    ${workflowName} (${workflow.id})`);
		// eslint-disable-next-line no-console
		console.log(`  API Key:     ${ownerApiKey.rawApiKey}`);
		// eslint-disable-next-line no-console
		console.log(`\n  Result:      ${task.status}`);
		// eslint-disable-next-line no-console
		console.log(`  Summary:     ${task.summary}`);
		// eslint-disable-next-line no-console
		console.log(`  Steps:       ${JSON.stringify(task.steps, null, 2)}`);

		// eslint-disable-next-line no-console
		console.log(`\n${DIVIDER}`);
		// eslint-disable-next-line no-console
		console.log('  TRY IT YOURSELF (copy-paste these)');
		// eslint-disable-next-line no-console
		console.log(DIVIDER);

		// Curl commands use backendUrl (host perspective — from your terminal)
		// eslint-disable-next-line no-console
		console.log(`
  # 1. Agent A card (A2A discovery)
  curl -s ${backendUrl}/rest/agents/${agentA.id}/card \\
    -H "x-n8n-api-key: ${ownerApiKey.rawApiKey}" | jq .

  # 2. Agent B card
  curl -s ${backendUrl}/rest/agents/${agentB.id}/card \\
    -H "x-n8n-api-key: ${ownerApiKey.rawApiKey}" | jq .

  # 3. Cross-instance delegation (JSON)
  curl -s -X POST ${backendUrl}/rest/agents/${agentA.id}/task \\
    -H "Content-Type: application/json" \\
    -H "x-n8n-api-key: ${ownerApiKey.rawApiKey}" \\
    -d '{
      "prompt": "Delegate to ${agentB.firstName} to run their workflow.",
      "externalAgents": [{
        "name": "${agentB.firstName}",
        "description": "Knowledge base manager",
        "url": "http://localhost:5678/rest/agents/${agentB.id}/task",
        "apiKey": "${ownerApiKey.rawApiKey}"
      }]
    }' | jq .

  # 4. Cross-instance delegation (SSE streaming)
  curl -N -X POST ${backendUrl}/rest/agents/${agentA.id}/task \\
    -H "Content-Type: application/json" \\
    -H "Accept: text/event-stream" \\
    -H "x-n8n-api-key: ${ownerApiKey.rawApiKey}" \\
    -d '{
      "prompt": "Delegate to ${agentB.firstName} to run their workflow.",
      "externalAgents": [{
        "name": "${agentB.firstName}",
        "description": "Knowledge base manager",
        "url": "http://localhost:5678/rest/agents/${agentB.id}/task",
        "apiKey": "${ownerApiKey.rawApiKey}"
      }]
    }'

  # 5. Direct task to Agent B (no delegation)
  curl -s -X POST ${backendUrl}/rest/agents/${agentB.id}/task \\
    -H "Content-Type: application/json" \\
    -H "x-n8n-api-key: ${ownerApiKey.rawApiKey}" \\
    -d '{"prompt": "Run your workflow and report the result."}' | jq .
`);

		// eslint-disable-next-line no-console
		console.log(DIVIDER);
		// eslint-disable-next-line no-console
		console.log('  Containers are alive. Cleanup: pnpm --filter n8n-containers stack:clean:all');
		// eslint-disable-next-line no-console
		console.log(`${DIVIDER}\n`);
	});

	test('should stream SSE with external: true markers', async ({
		agent: agentA,
		agentProject,
		agentLlmApiKey,
		api,
		backendUrl,
		ownerApiKey,
	}) => {
		test.skip(!agentLlmApiKey, 'N8N_AGENT_LLM_API_KEY not set');
		test.setTimeout(180_000);

		const internalUrl = getServerInternalUrl(backendUrl);

		const agentB = await api.agents.createAgent({
			firstName: `StreamBot-${nanoid(8)}`,
			description: 'Streaming demo target',
			agentAccessLevel: 'open',
		});

		await api.projects.addUserToProject(agentProject.id, agentA.id, 'project:editor');
		await api.projects.addUserToProject(agentProject.id, agentB.id, 'project:editor');

		const workflowName = `StreamBot Workflow ${nanoid(8)}`;
		const workflow = await api.workflows.createWorkflow({
			name: workflowName,
			nodes: [
				{
					id: nanoid(),
					name: 'When clicking "Test workflow"',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [250, 300],
					parameters: {},
				},
				{
					id: nanoid(),
					name: 'Set',
					type: 'n8n-nodes-base.set',
					typeVersion: 3.4,
					position: [450, 300],
					parameters: {
						assignments: {
							assignments: [
								{
									id: nanoid(),
									name: 'result',
									value: 'Streamed from remote!',
									type: 'string',
								},
							],
						},
					},
				},
			],
			connections: {
				'When clicking "Test workflow"': {
					main: [[{ node: 'Set', type: 'main', index: 0 }]],
				},
			},
		});
		await api.workflows.transfer(workflow.id, agentProject.id);

		// SSE request — uses backendUrl (host perspective) for the test client request,
		// but externalAgents URL uses internalUrl (server perspective for HTTP delegation)
		const response = await fetch(`${backendUrl}/rest/agents/${agentA.id}/task`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
				'x-n8n-api-key': ownerApiKey.rawApiKey,
			},
			body: JSON.stringify({
				prompt: `Delegate to ${agentB.firstName} to run their workflow and report the result.`,
				externalAgents: [
					{
						name: agentB.firstName,
						description: 'Streaming demo target',
						url: `${internalUrl}/rest/agents/${agentB.id}/task`,
						apiKey: ownerApiKey.rawApiKey,
					},
				],
			}),
		});

		expect(response.ok).toBe(true);

		const body = await response.text();
		const events = parseSseEvents(body);

		// eslint-disable-next-line no-console
		console.log('\n--- SSE Stream (external delegation) ---');
		for (const event of events) {
			const marker = event.external ? ' [EXTERNAL]' : '';
			// eslint-disable-next-line no-console
			console.log(`  ${String(event.type)}${marker}: ${JSON.stringify(event)}`);
		}
		// eslint-disable-next-line no-console
		console.log('--- End Stream ---\n');

		expect(events.length).toBeGreaterThanOrEqual(3);

		// Verify external: true appears on delegation events
		const externalStep = events.find(
			(e) => e.type === 'step' && e.action === 'send_message' && e.external === true,
		);
		expect(externalStep).toBeTruthy();

		const externalObs = events.find(
			(e) => e.type === 'observation' && e.action === 'send_message' && e.external === true,
		);
		expect(externalObs).toBeTruthy();

		const doneEvent = events[events.length - 1];
		expect(doneEvent.type).toBe('done');
		expect(doneEvent.status).toBe('completed');
	});
});
