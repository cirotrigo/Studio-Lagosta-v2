import { SignUp } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md pt-20">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Criar Conta</CardTitle>
            <CardDescription>
              Cadastre-se para começar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignUp 
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
              path="/sign-up"
              signInUrl="/sign-in"
            />
          </CardContent>
        </Card>
        
        <div className="text-center mt-6">
          <p className="text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link href="/sign-in" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}