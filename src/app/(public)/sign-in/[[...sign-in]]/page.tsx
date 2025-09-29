import { SignIn } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
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
                }
              }}
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
            />
          </CardContent>
        </Card>
        
        <div className="text-center mt-6">
          <p className="text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link href="/sign-up" className="text-primary hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}