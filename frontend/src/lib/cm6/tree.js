import { syntaxTree } from '@codemirror/language'

// The parser runs async, so a plugin built at first paint sees a partial
// tree; without this, late syntax never reaches the DOM until the user types.
export function treeAdvanced(update) {
  return syntaxTree(update.startState) !== syntaxTree(update.state)
}
