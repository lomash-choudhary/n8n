import { mock } from 'jest-mock-extended';
import type { IHookFunctions, INode } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { LinearTrigger } from '../LinearTrigger.node';

describe('LinearTrigger', () => {
	const mockHookFunctions = mock<IHookFunctions>();
	const mockStaticData: Record<string, string> = {};
	const mockHttpRequestWithAuthentication = jest.fn();
	const mockNode = mock<INode>();

	beforeEach(() => {
		jest.clearAllMocks();
		Object.keys(mockStaticData).forEach((key) => delete mockStaticData[key]);
		mockHookFunctions.getWorkflowStaticData.mockReturnValue(mockStaticData);
		mockHookFunctions.getNodeWebhookUrl.mockReturnValue('https://n8n.io/webhook/linear-test');
		mockHookFunctions.getNode.mockReturnValue(mockNode);

		// Mock getNodeParameter to return different values based on parameter name
		mockHookFunctions.getNodeParameter.mockImplementation((parameterName: string) => {
			switch (parameterName) {
				case 'authentication':
					return 'apiToken';
				case 'teamId':
					return 'team_123';
				case 'resources':
					return ['issue'];
				default:
					return undefined;
			}
		});

		// Mock the httpRequestWithAuthentication helper
		mockHookFunctions.helpers = {
			...mockHookFunctions.helpers,
			httpRequestWithAuthentication: mockHttpRequestWithAuthentication,
		};
	});

	describe('webhookMethods.checkExists', () => {
		it('should return false when no matching webhook exists', async () => {
			// Mock successful API response with no matching webhooks
			mockHttpRequestWithAuthentication.mockResolvedValue({
				data: {
					webhooks: {
						nodes: [
							{
								id: 'webhook_123',
								url: 'https://other-app.com/webhook',
								enabled: true,
								team: {
									id: 'other_team',
									name: 'Other Team',
								},
							},
						],
					},
				},
			});

			const linearTrigger = new LinearTrigger();
			const exists = await linearTrigger.webhookMethods.default.checkExists.call(
				mockHookFunctions,
			);

			expect(exists).toBe(false);
			expect(mockStaticData.webhookId).toBeUndefined();
		});

		it('should return true and store webhook ID when matching webhook exists', async () => {
			// Mock successful API response with matching webhook
			mockHttpRequestWithAuthentication.mockResolvedValue({
				data: {
					webhooks: {
						nodes: [
							{
								id: 'webhook_456',
								url: 'https://n8n.io/webhook/linear-test',
								enabled: true,
								team: {
									id: 'team_123',
									name: 'Test Team',
								},
							},
						],
					},
				},
			});

			const linearTrigger = new LinearTrigger();
			const exists = await linearTrigger.webhookMethods.default.checkExists.call(
				mockHookFunctions,
			);

			expect(exists).toBe(true);
			expect(mockStaticData.webhookId).toBe('webhook_456');
		});
	});

	describe('webhookMethods.create', () => {
		it('should successfully create webhook and store webhook ID', async () => {
			// Mock successful webhook creation
			mockHttpRequestWithAuthentication.mockResolvedValue({
				data: {
					webhookCreate: {
						success: true,
						webhook: {
							id: 'webhook_789',
							enabled: true,
						},
					},
				},
			});

			const linearTrigger = new LinearTrigger();
			const created = await linearTrigger.webhookMethods.default.create.call(mockHookFunctions);

			expect(created).toBe(true);
			expect(mockStaticData.webhookId).toBe('webhook_789');
		});

		it('should return false when webhook creation fails with success=false', async () => {
			// Mock failed webhook creation (success=false)
			// Note: Linear's API still returns a webhook object even when success=false
			mockHttpRequestWithAuthentication.mockResolvedValue({
				data: {
					webhookCreate: {
						success: false,
						webhook: {
							id: null,
							enabled: false,
						},
					},
				},
			});

			const linearTrigger = new LinearTrigger();
			const created = await linearTrigger.webhookMethods.default.create.call(mockHookFunctions);

			expect(created).toBe(false);
			expect(mockStaticData.webhookId).toBeUndefined();
		});

		it('should throw error with cryptic message when credentials lack admin permissions (demonstrates bug)', async () => {
			// BUG REPRODUCTION: Mock Linear API error response when user lacks admin permissions
			// This is the actual error structure that Linear returns
			mockHttpRequestWithAuthentication.mockResolvedValue({
				errors: [
					{
						message: 'Invalid role: admin required',
						extensions: {
							userPresentableMessage:
								'You need to have the "Admin" scope to create webhooks.',
						},
					},
				],
			});

			const linearTrigger = new LinearTrigger();

			// Verify the error is thrown (this works)
			await expect(
				linearTrigger.webhookMethods.default.create.call(mockHookFunctions),
			).rejects.toThrow(NodeApiError);

			// Verify the actual bug: error message doesn't mention Linear
			try {
				await linearTrigger.webhookMethods.default.create.call(mockHookFunctions);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				const nodeApiError = error as NodeApiError;

				// BUG: The error message is cryptic and doesn't mention Linear
				// Users see "Invalid role: admin required" without context
				// They don't know if it's an n8n role issue or a Linear API issue
				expect(nodeApiError.message).toBe('Invalid role: admin required');

				// The description contains the userPresentableMessage from Linear
				expect(nodeApiError.description).toBe(
					'You need to have the "Admin" scope to create webhooks.',
				);

				// BUG: Neither the message nor description mentions "Linear"
				// This is confusing because users don't know which service requires admin permissions
				expect(nodeApiError.message.toLowerCase().includes('linear')).toBe(false);
				expect(nodeApiError.description?.toLowerCase().includes('linear')).toBe(false);

				// Expected improvement: error should clearly state this is a Linear API requirement
				// e.g., "Linear API error: Invalid role: admin required"
				// or "The Linear trigger could not be activated because your credentials require admin permissions"
			}
		});

		it('should throw a descriptive error when API returns an error with userPresentableMessage', async () => {
			// Mock another type of Linear API error
			mockHttpRequestWithAuthentication.mockResolvedValue({
				errors: [
					{
						message: 'Forbidden',
						extensions: {
							userPresentableMessage: 'Your token does not have permission to create webhooks',
						},
					},
				],
			});

			const linearTrigger = new LinearTrigger();

			await expect(
				linearTrigger.webhookMethods.default.create.call(mockHookFunctions),
			).rejects.toThrow(NodeApiError);

			// Verify the error includes the userPresentableMessage
			try {
				await linearTrigger.webhookMethods.default.create.call(mockHookFunctions);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				const nodeApiError = error as NodeApiError;

				// Should include helpful information about the permission issue
				expect(
					nodeApiError.description?.includes('permission') ||
						nodeApiError.message.includes('permission'),
				).toBe(true);
			}
		});

		// This test will FAIL until the bug is fixed
		it.skip('should throw error that clearly mentions Linear when webhook creation fails (expected behavior)', async () => {
			// Mock Linear API error response when user lacks admin permissions
			mockHttpRequestWithAuthentication.mockResolvedValue({
				errors: [
					{
						message: 'Invalid role: admin required',
						extensions: {
							userPresentableMessage:
								'You need to have the "Admin" scope to create webhooks.',
						},
					},
				],
			});

			const linearTrigger = new LinearTrigger();

			try {
				await linearTrigger.webhookMethods.default.create.call(mockHookFunctions);
				fail('Expected error to be thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				const nodeApiError = error as NodeApiError;

				// EXPECTED FIX: Error message should clearly mention Linear
				// This will fail with current implementation
				expect(
					nodeApiError.message.toLowerCase().includes('linear') ||
						nodeApiError.description?.toLowerCase().includes('linear'),
				).toBe(true);

				// Error should also mention webhooks to provide context
				expect(
					nodeApiError.message.toLowerCase().includes('webhook') ||
						nodeApiError.description?.toLowerCase().includes('webhook'),
				).toBe(true);

				// Example of good error message:
				// "Linear webhook could not be created: Your Linear credentials require admin permissions"
				// or "The Linear trigger requires admin permissions to create webhooks"
			}
		});
	});

	describe('webhookMethods.delete', () => {
		it('should successfully delete webhook and clear webhook ID', async () => {
			// Set up existing webhook
			mockStaticData.webhookId = 'webhook_to_delete';

			// Mock successful deletion
			mockHttpRequestWithAuthentication.mockResolvedValue({
				data: {
					webhookDelete: {
						success: true,
					},
				},
			});

			const linearTrigger = new LinearTrigger();
			const deleted = await linearTrigger.webhookMethods.default.delete.call(mockHookFunctions);

			expect(deleted).toBe(true);
			expect(mockStaticData.webhookId).toBeUndefined();
		});

		it('should return true even when webhook ID is not set', async () => {
			// No webhook ID set
			expect(mockStaticData.webhookId).toBeUndefined();

			const linearTrigger = new LinearTrigger();
			const deleted = await linearTrigger.webhookMethods.default.delete.call(mockHookFunctions);

			expect(deleted).toBe(true);
			expect(mockHttpRequestWithAuthentication).not.toHaveBeenCalled();
		});

		it('should return false and not throw when deletion fails', async () => {
			// Set up existing webhook
			mockStaticData.webhookId = 'webhook_to_delete';

			// Mock failed deletion (e.g., network error)
			mockHttpRequestWithAuthentication.mockRejectedValue(new Error('Network error'));

			const linearTrigger = new LinearTrigger();
			const deleted = await linearTrigger.webhookMethods.default.delete.call(mockHookFunctions);

			expect(deleted).toBe(false);
			// Webhook ID should still be present since deletion failed
			expect(mockStaticData.webhookId).toBe('webhook_to_delete');
		});
	});
});
