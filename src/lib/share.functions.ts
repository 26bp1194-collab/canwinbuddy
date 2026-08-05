import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSharedQuiz = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("quiz_shares")
      .select("title, questions, question_count")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("Unable to load this quiz");
    return row ?? null;
  });
