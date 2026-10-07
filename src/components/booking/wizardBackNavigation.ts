/**
 * Pure decision helpers for leaving / stepping back in the customer booking wizard.
 * Used by the Android hardware back button and the header close («×») button.
 */
export type WizardBackAction = 'previous' | 'confirmExit' | 'exitToHome' | 'ignore';

export interface WizardNavigationState {
  /** Current wizard step (1..4). */
  step: number;
  /** An order submission request is in flight. */
  submitting: boolean;
  /** The order was submitted successfully (success card is showing). */
  submitted: boolean;
}

/** Android hardware back: step back inside the wizard, confirm exit on step 1. */
export const getWizardBackAction = ({ step, submitting, submitted }: WizardNavigationState): WizardBackAction => {
  if (submitting) return 'ignore';
  if (submitted) return 'exitToHome';
  if (step >= 2) return 'previous';
  return 'confirmExit';
};

/** Header close button: always asks for confirmation unless the order is already submitted. */
export const getWizardCloseAction = ({ submitting, submitted }: WizardNavigationState): WizardBackAction => {
  if (submitting) return 'ignore';
  if (submitted) return 'exitToHome';
  return 'confirmExit';
};
