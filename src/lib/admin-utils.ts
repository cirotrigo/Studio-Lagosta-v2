import { currentUser } from "@clerk/nextjs/server";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(",") || [];

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    if (ADMIN_USER_IDS.includes(userId)) return true;

    const user = await currentUser();
    if (!user) return false;

    const userEmail = user.emailAddresses[0]?.emailAddress;
    return ADMIN_EMAILS.includes(userEmail);
  } catch (error) {
    console.error("Admin check error:", error);
    return false;
  }
}
