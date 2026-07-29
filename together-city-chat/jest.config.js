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
};
