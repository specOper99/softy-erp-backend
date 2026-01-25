// Manual mock for p-limit (v3 CommonJS version)
const pLimit = jest.fn((_concurrency: number) => {
  // Return a function that just executes the passed function immediately
  return jest.fn((fn: () => Promise<unknown>) => fn());
});

module.exports = pLimit;
export default pLimit;
