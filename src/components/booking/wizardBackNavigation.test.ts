import { describe, expect, it } from 'vitest';
import { getWizardBackAction, getWizardCloseAction } from './wizardBackNavigation';

const idle = { submitting: false, submitted: false };

describe('getWizardBackAction (Android hardware back)', () => {
  it('asks for exit confirmation on step 1', () => {
    expect(getWizardBackAction({ step: 1, ...idle })).toBe('confirmExit');
  });

  it.each([2, 3, 4])('goes to the previous step on step %i', (step) => {
    expect(getWizardBackAction({ step, ...idle })).toBe('previous');
  });

  it('ignores back while the order is being submitted', () => {
    expect(getWizardBackAction({ step: 4, submitting: true, submitted: false })).toBe('ignore');
  });

  it('returns home without confirmation after a successful submission', () => {
    expect(getWizardBackAction({ step: 4, submitting: false, submitted: true })).toBe('exitToHome');
  });
});

describe('getWizardCloseAction (header close button)', () => {
  it.each([1, 2, 3, 4])('asks for exit confirmation on step %i', (step) => {
    expect(getWizardCloseAction({ step, ...idle })).toBe('confirmExit');
  });

  it('ignores close while submitting and exits directly after success', () => {
    expect(getWizardCloseAction({ step: 4, submitting: true, submitted: false })).toBe('ignore');
    expect(getWizardCloseAction({ step: 4, submitting: false, submitted: true })).toBe('exitToHome');
  });
});
