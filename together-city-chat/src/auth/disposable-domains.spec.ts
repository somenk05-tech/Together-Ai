import { isDisposableEmail } from './disposable-domains';

describe('disposable-email gate (M1)', () => {
  it('refuses the throwaway services and their subdomains', () => {
    expect(isDisposableEmail('x@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@MAILINATOR.com')).toBe(true);
    expect(isDisposableEmail('x@team.yopmail.net')).toBe(true);
  });
  it('never touches a real address — a false positive costs a real signup', () => {
    for (const e of ['asha@gmail.com', 'x@togethercity.app', 'a@mailinator.company.in', 'x@tempmail.company.org']) {
      expect(isDisposableEmail(e)).toBe(false);
    }
  });
});
