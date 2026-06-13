/**
 * Mathematical utilities and helper functions.
 * Demonstrates named function declarations and arrow function declarations in our AST chunker.
 */

/**
 * Helper to validate if a value is a number.
 * @param {*} value
 * @returns {boolean}
 */
export function isNumber(value) {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Formats a mathematical operation nicely as a string.
 * @param {string} op - operation name
 * @param {number} a
 * @param {number} b
 * @param {number} result
 * @returns {string}
 */
export const formatOperation = (op, a, b, result) => {
  const symbols = {
    add: '+',
    subtract: '-',
    multiply: '*',
    divide: '/'
  };
  const sym = symbols[op] || '?';
  return `${a} ${sym} ${b} = ${result}`;
};

/**
 * Prints all history items to the console.
 * @param {Array} history
 */
export function printHistory(history) {
  history.forEach(item => {
    const formatted = formatOperation(item.op, item.a, item.b, item.result);
    console.log(`[Log] ${formatted}`);
  });
}
