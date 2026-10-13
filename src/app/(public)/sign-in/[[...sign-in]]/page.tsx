import { SignIn } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md pt-20">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Entrar</CardTitle>
            <CardDescription>
              Bem-vindo de volta!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignIn 
              appearance={{
                elements: {
                  formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
                  card: "shadow-none border-0",
                  headerTitle: "text-2xl font-semibold",
                  headerSubtitle: "text-muted-foreground",
                  socialButtonsBlockButton: "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                  formFieldInput: "border-input bg-background",
                  footerActionLink: "text-primary hover:text-primary/80",
                  // Acesso só por convite: some o "Não tem uma conta? Inscreva-se"
                  // do Clerk. O convite cai direto em /sign-up, que segue no ar.
                  footerAction: { display: "none" },
                }
              }}
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}