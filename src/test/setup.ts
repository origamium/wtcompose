// Test setup file
import { afterEach } from "vitest"

let cleanupTasks: (() => void)[] = []

afterEach(async () => {
  // Clean up any test repositories
  for (const task of cleanupTasks) {
    task()
  }
  cleanupTasks = []
})

export function addCleanupTask(task: () => void) {
  cleanupTasks.push(task)
}
