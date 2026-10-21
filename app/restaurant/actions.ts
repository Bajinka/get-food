"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staff } from "@/lib/staff";
import { restaurantId } from "@/lib/menu";
const uuid = z.uuid();
const text = (f: FormData, k: string) => String(f.get(k) || "").trim();
export async function staffAction(
  _previous: { error?: string; success?: string; token?: string },
  form: FormData,
): Promise<{ error?: string; success?: string; token?: string }> {
  try {
    const action = text(form, "action");
    const management = ["owner", "manager"];
    const { client } = await staff(
      action === "payment"
        ? ["owner", "manager", "cashier"]
        : ["order", "verify-table"].includes(action)
          ? undefined
          : ["staff", "remove-staff"].includes(action)
            ? ["owner"]
            : management,
    );
    let result: { error: { message: string } | null };
    switch (action) {
      case "service-time":
        result = await client.rpc("confirm_service_time", {
          order_ref: uuid.parse(text(form, "id")),
          service_time: z.iso
            .datetime()
            .parse(text(form, "service_time") + ":00Z"),
        });
        break;
      case "branding":
        result = await client
          .from("restaurants")
          .update({
            name: z.string().min(1).max(100).parse(text(form, "name")),
            description: text(form, "description").slice(0, 1000),
            phone: text(form, "phone").slice(0, 30),
            address: text(form, "address").slice(0, 500),
          })
          .eq("id", restaurantId);
        break;
      case "group":
        result = await client.from("menu_option_groups").insert({
          restaurant_id: restaurantId,
          menu_item_id: uuid.parse(text(form, "menu_item_id")),
          name: z.string().min(1).max(100).parse(text(form, "name")),
          min_choices: z.coerce
            .number()
            .int()
            .min(0)
            .max(30)
            .parse(text(form, "min_choices")),
          max_choices: z.coerce
            .number()
            .int()
            .min(1)
            .max(30)
            .parse(text(form, "max_choices")),
        });
        break;
      case "option":
        result = await client.from("menu_options").insert({
          restaurant_id: restaurantId,
          group_id: uuid.parse(text(form, "group_id")),
          name: z.string().min(1).max(100).parse(text(form, "name")),
          price: z.coerce
            .number()
            .min(0)
            .max(9999999)
            .parse(text(form, "price")),
          available: true,
        });
        break;
      case "delete-option":
        result = await client
          .from("menu_options")
          .update({ available: false })
          .eq("id", uuid.parse(text(form, "id")))
          .eq("restaurant_id", restaurantId);
        break;
      case "verify-table":
        result = await client.rpc("verify_table", {
          order_ref: uuid.parse(text(form, "id")),
        });
        break;
      case "remove-staff":
        result = await client.rpc("remove_staff", {
          tenant: restaurantId,
          member: uuid.parse(text(form, "user_id")),
        });
        break;
      case "order":
        result = await client.rpc("change_order", {
          order_ref: uuid.parse(text(form, "id")),
          next_status: z
            .enum([
              "accepted",
              "preparing",
              "ready",
              "completed",
              "rejected",
              "cancelled",
            ])
            .parse(text(form, "status")),
        });
        break;
      case "payment":
        result = await client.rpc("review_payment", {
          order_ref: uuid.parse(text(form, "id")),
          decision: z
            .enum(["verified", "rejected", "refunded"])
            .parse(text(form, "status")),
          reason: text(form, "reason").slice(0, 500),
        });
        break;
      case "qr": {
        const { data, error } = await client.rpc("issue_qr", {
          tenant: restaurantId,
          table_ref: text(form, "table_id")
            ? uuid.parse(text(form, "table_id"))
            : null,
        });
        if (error) throw error;
        return {
          token: data,
          success:
            "QR created. Download it now; the token is not stored in recoverable form.",
        };
      }
      case "revoke":
        result = await client.rpc("revoke_qr", {
          qr_ref: uuid.parse(text(form, "id")),
        });
        break;
      case "staff":
        result = await client.rpc("set_staff", {
          tenant: restaurantId,
          member: uuid.parse(text(form, "user_id")),
          assigned_role: z
            .enum(["owner", "manager", "cashier", "kitchen", "waiter"])
            .parse(text(form, "role")),
        });
        break;
      case "category":
        result = await client.from("menu_categories").insert({
          restaurant_id: restaurantId,
          name: z.string().min(1).max(100).parse(text(form, "name")),
        });
        break;
      case "rename-category":
        result = await client
          .from("menu_categories")
          .update({
            name: z.string().min(1).max(100).parse(text(form, "name")),
          })
          .eq("restaurant_id", restaurantId)
          .eq("id", uuid.parse(text(form, "id")));
        break;
      case "rename-table":
        result = await client
          .from("dining_tables")
          .update({
            number: z.string().min(1).max(20).parse(text(form, "number")),
          })
          .eq("restaurant_id", restaurantId)
          .eq("id", uuid.parse(text(form, "id")));
        break;
      case "delete-category":
        result = await client
          .from("menu_categories")
          .delete()
          .eq("restaurant_id", restaurantId)
          .eq("id", uuid.parse(text(form, "id")));
        break;
      case "table":
        result = await client.from("dining_tables").insert({
          restaurant_id: restaurantId,
          number: z.string().min(1).max(20).parse(text(form, "number")),
        });
        break;
      case "table-active":
        result = await client
          .from("dining_tables")
          .update({ active: text(form, "active") === "true" })
          .eq("restaurant_id", restaurantId)
          .eq("id", uuid.parse(text(form, "id")));
        break;
      case "menu": {
        let image_url = text(form, "image_url") || null;
        const file = form.get("image");
        if (file instanceof File && file.size) {
          if (file.size > 2 * 1024 * 1024)
            throw new Error("Image must be smaller than 2 MB.");
          const bytes = new Uint8Array(await file.arrayBuffer());
          const kind =
            bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
              ? "jpeg"
              : bytes[0] === 0x89 &&
                  Buffer.from(bytes.subarray(1, 4)).toString() === "PNG"
                ? "png"
                : Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
                    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
                  ? "webp"
                  : null;
          if (!kind || file.type !== `image/${kind}`)
            throw new Error("Use a valid JPEG, PNG or WebP image.");
          const path = `${restaurantId}/${crypto.randomUUID()}.${kind}`;
          const upload = await client.storage
            .from("menu-images")
            .upload(path, bytes, {
              contentType: `image/${kind}`,
              upsert: false,
            });
          if (upload.error) throw upload.error;
          image_url = client.storage.from("menu-images").getPublicUrl(path)
            .data.publicUrl;
        }
        const values = {
          restaurant_id: restaurantId,
          name: z.string().min(1).max(100).parse(text(form, "name")),
          description: z.string().max(1000).parse(text(form, "description")),
          category_id: uuid.parse(text(form, "category_id")),
          price: z.coerce
            .number()
            .min(0)
            .max(9999999)
            .parse(text(form, "price")),
          preparation_minutes: z.coerce
            .number()
            .int()
            .min(1)
            .max(240)
            .parse(text(form, "preparation_minutes")),
          available: form.get("available") === "on",
          image_url,
        };
        result = text(form, "id")
          ? await client
              .from("menu_items")
              .update(values)
              .eq("restaurant_id", restaurantId)
              .eq("id", uuid.parse(text(form, "id")))
          : await client.from("menu_items").insert(values);
        break;
      }
      case "settings":
        result = await client
          .from("restaurant_settings")
          .update({
            preparation_minutes: z.coerce
              .number()
              .int()
              .min(5)
              .max(240)
              .parse(text(form, "preparation_minutes")),
            cutoff_minutes: z.coerce
              .number()
              .int()
              .min(15)
              .max(1440)
              .parse(text(form, "cutoff_minutes")),
            slot_capacity: z.coerce
              .number()
              .int()
              .min(1)
              .max(500)
              .parse(text(form, "slot_capacity")),
            payment_deadline_minutes: z.coerce
              .number()
              .int()
              .min(5)
              .max(1440)
              .parse(text(form, "payment_deadline_minutes")),
            wave_instructions: text(form, "wave_instructions").slice(0, 2000),
            afrimoney_instructions: text(form, "afrimoney_instructions").slice(
              0,
              2000,
            ),
            cancellation_policy: text(form, "cancellation_policy").slice(
              0,
              2000,
            ),
          })
          .eq("restaurant_id", restaurantId);
        break;
      case "hours": {
        const day = z.coerce
          .number()
          .int()
          .min(0)
          .max(6)
          .parse(text(form, "weekday"));
        if (form.get("closed") === "on")
          result = await client
            .from("restaurant_hours")
            .delete()
            .eq("restaurant_id", restaurantId)
            .eq("weekday", day);
        else
          result = await client.from("restaurant_hours").upsert(
            {
              restaurant_id: restaurantId,
              weekday: day,
              opens: z
                .string()
                .regex(/^\d{2}:\d{2}$/)
                .parse(text(form, "opens")),
              closes: z
                .string()
                .regex(/^\d{2}:\d{2}$/)
                .parse(text(form, "closes")),
            },
            { onConflict: "restaurant_id,weekday" },
          );
        break;
      }
      default:
        throw new Error("Unknown operation");
    }
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/restaurant", "layout");
    revalidatePath("/menu");
    return { success: "Saved successfully." };
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? error.issues[0].message
          : error instanceof Error
            ? error.message
            : "The operation could not be completed.",
    };
  }
}
