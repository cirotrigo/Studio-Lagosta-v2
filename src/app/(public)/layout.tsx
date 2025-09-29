import { PublicHeader } from "@/components/app/public-header"
import { PublicFooter } from "@/components/app/public-footer"
import { CookieConsent } from "@/components/app/cookie-consent"

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
      <CookieConsent />
    </div>
  );
}
