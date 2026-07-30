module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '(test|src)/.*\\.spec\\.ts$',
  // ts-jest handles TypeScript only. The setup file below is plain JS and needs
  // no compiling — matching .js here made ts-jest warn on every single run
  // ("Got a .js file to compile while allowJs is not set to true"), which is
  // noise that trains people to ignore warnings.
  transform: { '^.+\\.ts$': 'ts-jest' },
  setupFiles: ['<rootDir>/test/jest-globals.js'],
  collectCoverageFrom: ['src/**/*.ts'],

  // The simulation suites each build the full 10,013-recipe pool and hold it for
  // the length of the run — sim-250, sim-150, qa-matrix, perf-load and
  // diet-contract all do. Jest defaults to one worker per core, so on an 8- or
  // 10-core laptop five of those land in memory at once and a worker gets killed
  // by the OS. It surfaces as `SIGSEGV` against whichever innocent suite the
  // dead worker happened to be holding, which is the worst possible way for it
  // to present: energy.spec.ts failed a full run and passed on its own, and
  // nothing about the message pointed at memory.
  //
  // Half the cores, and a worker that has grown past a gigabyte between tests is
  // restarted rather than left to be killed.
  maxWorkers: '50%',
  workerIdleMemoryLimit: '1GB',
};
