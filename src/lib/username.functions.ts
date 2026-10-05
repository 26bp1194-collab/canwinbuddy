import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const isUsernameTaken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ username: z.string().trim().min(4).max(50).regex(/^[A-Za-z0-9]+$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username_lower", data.username.toLowerCase())
      .maybeSingle();
    if (error) throw new Error("Unable to check username");
    return { taken: !!row };
  });
