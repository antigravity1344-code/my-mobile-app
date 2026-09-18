import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CleanerProfile } from '../types/cleaner';
import { cleanerService } from '../services/cleanerService';
import { validateCleanerSignup, type SignupConsentState } from '../validation/cleanerValidation';
import {
  calculateCleanerStats,
  filterCleaners,
  type CleanerFilterTab,
  type CleanerMarketplaceStats,
} from '../utils';

interface CleanersContextValue {
  allCleaners: CleanerProfile[];
  cleaners: CleanerProfile[];
  loading: boolean;
  refreshing: boolean;
  filterTab: CleanerFilterTab;
  searchQuery: string;
  stats: CleanerMarketplaceStats;
  selectedCleanerId: string | null;
  selectedCleaner: CleanerProfile | undefined;
  signupVisible: boolean;
  signupConsent: SignupConsentState;
  signupErrors: string[];
  signupSuccess: boolean;
  setFilterTab: (tab: CleanerFilterTab) => void;
  setSearchQuery: (query: string) => void;
  refreshCleaners: () => Promise<void>;
  selectCleaner: (cleanerId: string | null) => void;
  openSignup: () => void;
  closeSignup: () => void;
  toggleSignupRule: (ruleKey: string) => void;
  toggleIdentityCheck: () => void;
  submitSignupConsent: () => boolean;
}

const emptyConsent = (): SignupConsentState => ({
  acceptedRuleKeys: [],
  acceptedIdentityCheck: false,
});

const CleanersContext = createContext<CleanersContextValue | undefined>(undefined);

export const CleanersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allCleaners, setAllCleaners] = useState<CleanerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<CleanerFilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCleanerId, setSelectedCleanerId] = useState<string | null>(null);
  const [signupVisible, setSignupVisible] = useState(false);
  const [signupConsent, setSignupConsent] = useState<SignupConsentState>(emptyConsent);
  const [signupErrors, setSignupErrors] = useState<string[]>([]);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const fetchCleaners = useCallback(async () => {
    try {
      const list = await cleanerService.listCleaners();
      setAllCleaners(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchCleaners();
  }, [fetchCleaners]);

  const refreshCleaners = useCallback(async () => {
    setRefreshing(true);
    await fetchCleaners();
  }, [fetchCleaners]);

  const cleaners = useMemo(
    () => filterCleaners(allCleaners, filterTab, searchQuery),
    [allCleaners, filterTab, searchQuery],
  );

  const stats = useMemo(() => calculateCleanerStats(allCleaners), [allCleaners]);

  const selectedCleaner = useMemo(
    () => (selectedCleanerId ? allCleaners.find((item) => item.id === selectedCleanerId) : undefined),
    [selectedCleanerId, allCleaners],
  );

  const selectCleaner = useCallback((cleanerId: string | null) => {
    setSelectedCleanerId(cleanerId);
  }, []);

  const openSignup = useCallback(() => {
    setSignupConsent(emptyConsent());
    setSignupErrors([]);
    setSignupSuccess(false);
    setSignupVisible(true);
  }, []);

  const closeSignup = useCallback(() => {
    setSignupVisible(false);
  }, []);

  const toggleSignupRule = useCallback((ruleKey: string) => {
    setSignupSuccess(false);
    setSignupConsent((current) => {
      const accepted = current.acceptedRuleKeys.includes(ruleKey)
        ? current.acceptedRuleKeys.filter((key) => key !== ruleKey)
        : [...current.acceptedRuleKeys, ruleKey];
      return { ...current, acceptedRuleKeys: accepted };
    });
  }, []);

  const toggleIdentityCheck = useCallback(() => {
    setSignupSuccess(false);
    setSignupConsent((current) => ({
      ...current,
      acceptedIdentityCheck: !current.acceptedIdentityCheck,
    }));
  }, []);

  const submitSignupConsent = useCallback(() => {
    const result = validateCleanerSignup(signupConsent);
    setSignupErrors(result.errors);
    setSignupSuccess(result.valid);
    return result.valid;
  }, [signupConsent]);

  const value = useMemo<CleanersContextValue>(
    () => ({
      allCleaners,
      cleaners,
      loading,
      refreshing,
      filterTab,
      searchQuery,
      stats,
      selectedCleanerId,
      selectedCleaner,
      signupVisible,
      signupConsent,
      signupErrors,
      signupSuccess,
      setFilterTab,
      setSearchQuery,
      refreshCleaners,
      selectCleaner,
      openSignup,
      closeSignup,
      toggleSignupRule,
      toggleIdentityCheck,
      submitSignupConsent,
    }),
    [
      allCleaners,
      cleaners,
      loading,
      refreshing,
      filterTab,
      searchQuery,
      stats,
      selectedCleanerId,
      selectedCleaner,
      signupVisible,
      signupConsent,
      signupErrors,
      signupSuccess,
      refreshCleaners,
      selectCleaner,
      openSignup,
      closeSignup,
      toggleSignupRule,
      toggleIdentityCheck,
      submitSignupConsent,
    ],
  );

  return <CleanersContext.Provider value={value}>{children}</CleanersContext.Provider>;
};

export const useCleaners = (): CleanersContextValue => {
  const context = useContext(CleanersContext);
  if (!context) {
    throw new Error('useCleaners must be used within CleanersProvider');
  }
  return context;
};
