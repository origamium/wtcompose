// Test setup file
import { beforeEach, afterEach } from 'vitest'
import { cleanup } from './helpers/git-test-helper'

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