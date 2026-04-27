import type { TaskState } from '@furball/shared';

interface TaskTemplate {
  type: 'short' | 'long' | 'common';
  name: string;
  room: string;
  steps: number;
}

const TASK_TEMPLATES: TaskTemplate[] = [
  { type: 'short', name: '修Bug', room: '服务器机房', steps: 2 },
  { type: 'short', name: '清理邮箱', room: '文印室', steps: 1 },
  { type: 'short', name: '整理简历', room: 'HR办公室', steps: 2 },
  { type: 'short', name: '擦白板', room: '会议室', steps: 1 },
  { type: 'long', name: '下载需求文档', room: '产品部', steps: 4 },
  { type: 'long', name: '向上管理', room: '老板办公室', steps: 5 },
  { type: 'long', name: '查考勤', room: '监控室', steps: 4 },
  { type: 'common', name: '整理工位', room: '开放工区', steps: 3 },
  { type: 'common', name: '泡咖啡', room: '茶水间', steps: 3 },
  { type: 'short', name: '查看监控', room: '监控室', steps: 2 },
  { type: 'long', name: '做PPT', room: '会议室', steps: 5 },
  { type: 'short', name: '领办公用品', room: '文印室', steps: 2 },
  { type: 'short', name: '写周报', room: '产品部', steps: 2 },
  { type: 'common', name: '巡楼', room: '电梯间', steps: 2 },
];

export class TaskManager {
  private rooms: string[];
  private playerTasks: Map<string, TaskState[]> = new Map();

  constructor(rooms: string[]) {
    this.rooms = rooms;
  }

  /**
   * Assign a set of tasks to a player. Returns the TaskState array.
   */
  assignTasks(playerId: string, count: number): TaskState[] {
    const shuffled = [...TASK_TEMPLATES].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    const tasks: TaskState[] = selected.map((tpl, idx) => ({
      id: `${playerId}_task_${idx}`,
      type: tpl.type,
      location: tpl.room,
      completed: false,
      steps: tpl.steps,
      currentStep: 0,
    }));

    this.playerTasks.set(playerId, tasks);
    return tasks;
  }

  /**
   * Progress tasks for a player who is currently in the given room.
   * Each call advances one step on a matching incomplete task.
   */
  progressTasks(playerId: string, currentRoom: string): void {
    const tasks = this.playerTasks.get(playerId);
    if (!tasks) return;

    for (const task of tasks) {
      if (task.completed) continue;
      if (task.location !== currentRoom) continue;

      task.currentStep = Math.min(task.currentStep + 1, task.steps);
      if (task.currentStep >= task.steps) {
        task.completed = true;
      }
      break; // Only progress one task per call
    }
  }

  /**
   * Get overall completion percentage (0-100) across all tracked players.
   */
  getOverallProgress(): number {
    let total = 0;
    let completed = 0;

    for (const tasks of this.playerTasks.values()) {
      for (const task of tasks) {
        total += task.steps;
        completed += task.currentStep;
      }
    }

    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  /**
   * Get tasks for a specific player.
   */
  getPlayerTasks(playerId: string): TaskState[] {
    return this.playerTasks.get(playerId) ?? [];
  }

  /**
   * Check if all tasks across all players are completed.
   */
  allTasksCompleted(): boolean {
    for (const tasks of this.playerTasks.values()) {
      for (const task of tasks) {
        if (!task.completed) return false;
      }
    }
    return true;
  }
}
