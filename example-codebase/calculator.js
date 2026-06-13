/**
 * A simple Calculator class to perform basic arithmetic operations.
 * Demonstrates class and method parsing in our AST chunker.
 */
class Calculator {
  constructor() {
    this.history = [];
  }

  /**
   * Adds two numbers and logs the operation.
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  add(a, b) {
    const result = a + b;
    this.history.push({ op: 'add', a, b, result });
    return result;
  }

  /**
   * Subtracts b from a and logs the operation.
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  subtract(a, b) {
    const result = a - b;
    this.history.push({ op: 'subtract', a, b, result });
    return result;
  }

  /**
   * Multiplies two numbers.
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  multiply(a, b) {
    return a * b;
  }

  /**
   * Divides a by b. Throws error if b is zero.
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  divide(a, b) {
    if (b === 0) {
      throw new Error("Division by zero is not allowed.");
    }
    return a / b;
  }

  /**
   * Returns the history of operations.
   */
  getHistory() {
    return this.history;
  }
}

export default Calculator;
