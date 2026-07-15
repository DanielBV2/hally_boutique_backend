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
  token: string;
}
