import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";

/** Shown to signed-in accounts that have no admin or tester role. */
export function NoAccess() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <BrandLogo className="h-9 w-auto max-w-[220px]" />
      <ShieldAlert className="size-10 text-destructive" aria-hidden="true" />
      <h1 className="font-display text-3xl tracking-wide">No access</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your account does not have access to the back office. Contact an administrator if you should
        have access, or sign in with another account.
      </p>
      <Button onClick={signOut} variant="outline" className="gap-2">
        <LogOut className="size-4" aria-hidden="true" />
        Logga ut
      </Button>
    </main>
  );
}
