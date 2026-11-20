import type { CycleResult } from '../types.js'

/**
 * Calculate the step cap for the Tab walk
 * Formula: focusableCount * 2 + 10
 * 
 * @param focusableCount Number of focusable elements on the page
 * @returns Maximum number of steps to take
 */
export function stepCap(focusableCount: number): number {
  return focusableCount * 2 + 10
}

/**
 * Detect if a sequence of focus steps contains a cycle
 * 
 * A cycle is detected when the same backendDOMNodeId appears a second time
 * before all focusable elements have been visited at least once.
 * 
 * @param steps Array of backendDOMNodeId strings in focus order
 * @param focusableCount Expected number of unique focusable elements
 * @returns CycleResult with cycle detection info
 */
export function detectCycle(steps: readonly string[], focusableCount: number): CycleResult {
  const visitedSet = new Set<string>()
  const focusableSet = new Set<string>()
  
  // Build focusableSet from the first focusableCount unique IDs
  for (const step of steps) {
    if (!visitedSet.has(step)) {
      visitedSet.add(step)
      focusableSet.add(step)
      if (focusableSet.size >= focusableCount) {
        break
      }
    }
  }
  
  // Reset visitedSet for cycle detection
  visitedSet.clear()
  
  // Walk steps looking for a cycle
  for (let i = 0; i < steps.length; i++) {
    const stepId = steps[i]
    
    if (visitedSet.has(stepId)) {
      // Found a repeat - check if we've visited all focusable elements
      if (visitedSet.size < focusableCount) {
        // Cycle detected before all focusables were visited
        // Collect cycle nodeIds from first occurrence to current
        const cycleStartIndex = steps.indexOf(stepId)
        const cycleNodeIds = steps.slice(cycleStartIndex, i)
        return {
          hasCycle: true,
          cycleStart: cycleStartIndex,
          cycleNodeIds: cycleNodeIds,
        }
      }
    }
    
    visitedSet.add(stepId)
  }
  
  // No cycle detected
  return {
    hasCycle: false,
    cycleStart: -1,
    cycleNodeIds: [],
  }
}
