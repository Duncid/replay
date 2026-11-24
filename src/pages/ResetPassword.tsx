import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate("/");
  };

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <div className="space-y-1">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full">Save password</Button>
      </form>
    </main>
  );
}
