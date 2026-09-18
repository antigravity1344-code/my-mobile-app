import type { CleanerProfile, CleanerTier } from '../types/cleaner';
import type { CleanerFilterTab } from './specialtyLabels';

export interface CleanerMarketplaceStats {
  totalCount: number;
  standardCount: number;
  midCount: number;
  vipCount: number;
}

export const calculateCleanerStats = (cleaners: CleanerProfile[]): CleanerMarketplaceStats => ({
  totalCount: cleaners.length,
  standardCount: cleaners.filter((item) => item.tier === 'STANDARD').length,
  midCount: cleaners.filter((item) => item.tier === 'MID').length,
  vipCount: cleaners.filter((item) => item.tier === 'VIP').length,
});

export const filterCleaners = (
  cleaners: CleanerProfile[],
  tab: CleanerFilterTab,
  searchQuery: string,
): CleanerProfile[] => {
  const query = searchQuery.trim();
  return cleaners.filter((item) => {
    const matchesTab = tab === 'ALL' || item.tier === (tab as CleanerTier);
    if (!matchesTab) return false;
    if (!query) return true;
    return (
      item.fullName.includes(query) ||
      item.district.includes(query) ||
      item.bio.includes(query) ||
      item.id.includes(query)
    );
  });
};
