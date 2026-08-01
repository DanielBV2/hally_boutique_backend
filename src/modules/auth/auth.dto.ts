export interface UserProfileDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
  createdAt: Date;
}

export interface AuthResponseDTO {
  user: UserProfileDTO;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponseDTO {
  accessToken: string;
  refreshToken: string;
}

export interface AdminUserListItemDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: Date;
}
