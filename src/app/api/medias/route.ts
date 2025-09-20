"use server";

import { createClient } from "@supabase/supabase-js";
import db from "@/lib/supabase/db";
import { medias } from "@/lib/supabase/schema";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData.getAll("files[]").filter((f): f is File => f instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  const useLocal = process.env.NODE_ENV === "development";

  // ⚡ Only create supabase client if not local
  const supabase = !useLocal
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
    : null;

  try {
    const uploadedUrls = await Promise.all(
      files.map(async (file) => {
        const fileExt = file.type.split("/")[1];
        const key = nanoid() + "." + fileExt;

        if (useLocal) {
          // ✅ Save locally
          const buffer = Buffer.from(await file.arrayBuffer());
          const filePath = path.join(process.cwd(), "public", "uploads", key);
          await writeFile(filePath, buffer);

          await db.insert(medias).values({
            alt: file.name,
            key: "uploads/" + key,
          });

          return `/uploads/${key}`;
        } else {
          // ✅ Upload to Supabase storage
          const { error } = await supabase!.storage
            .from("medias")
            .upload(`public/${key}`, file, {
              contentType: file.type,
              upsert: false,
            });

          if (error) throw error;

          await db.insert(medias).values({
            alt: file.name,
            key: `public/${key}`,
          });

          const { data } = supabase!.storage
            .from("medias")
            .getPublicUrl(`public/${key}`);

          return data.publicUrl;
        }
      })
    );

    return NextResponse.json(uploadedUrls, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 400 });
  }
}
