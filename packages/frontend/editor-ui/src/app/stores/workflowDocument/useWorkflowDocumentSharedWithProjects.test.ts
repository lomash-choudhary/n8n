import { describe, it, expect, vi } from 'vitest';
import { useWorkflowDocumentSharedWithProjects } from './useWorkflowDocumentSharedWithProjects';
import type { ProjectSharingData } from '@/features/collaboration/projects/projects.types';

function createSharedWithProjects() {
	return useWorkflowDocumentSharedWithProjects();
}

function createMockProject(id: string): ProjectSharingData {
	return {
		id,
		name: `Project ${id}`,
		icon: null,
		type: 'team',
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};
}

describe('useWorkflowDocumentSharedWithProjects', () => {
	describe('initial state', () => {
		it('should start with empty array', () => {
			const { sharedWithProjects } = createSharedWithProjects();
			expect(sharedWithProjects.value).toEqual([]);
		});
	});

	describe('setSharedWithProjects', () => {
		it('should set projects and fire event hook', () => {
			const { sharedWithProjects, setSharedWithProjects, onSharedWithProjectsChange } =
				createSharedWithProjects();
			const hookSpy = vi.fn();
			onSharedWithProjectsChange(hookSpy);

			const projects = [createMockProject('p1'), createMockProject('p2')];
			setSharedWithProjects(projects);

			expect(sharedWithProjects.value).toEqual(projects);
			expect(hookSpy).toHaveBeenCalledWith({
				action: 'update',
				payload: { sharedWithProjects: projects },
			});
		});

		it('should replace existing projects entirely', () => {
			const { sharedWithProjects, setSharedWithProjects } = createSharedWithProjects();
			setSharedWithProjects([createMockProject('p1')]);

			setSharedWithProjects([createMockProject('p2'), createMockProject('p3')]);

			expect(sharedWithProjects.value).toHaveLength(2);
			expect(sharedWithProjects.value[0].id).toBe('p2');
			expect(sharedWithProjects.value[1].id).toBe('p3');
		});

		it('should allow setting empty array', () => {
			const { sharedWithProjects, setSharedWithProjects } = createSharedWithProjects();
			setSharedWithProjects([createMockProject('p1')]);

			setSharedWithProjects([]);

			expect(sharedWithProjects.value).toEqual([]);
		});

		it('should fire event hook on every call', () => {
			const { setSharedWithProjects, onSharedWithProjectsChange } = createSharedWithProjects();
			const hookSpy = vi.fn();
			onSharedWithProjectsChange(hookSpy);

			setSharedWithProjects([createMockProject('p1')]);
			setSharedWithProjects([]);

			expect(hookSpy).toHaveBeenCalledTimes(2);
		});
	});
});
