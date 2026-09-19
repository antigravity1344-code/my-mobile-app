export interface UserData {
  id: string;
  phone: string;
  name: string;
  avatar: string;
  role: string;
  status: string; // REGISTERED, PENDING_VERIFICATION, APPROVED, ACTIVE
  isProfileComplete?: boolean;
}
