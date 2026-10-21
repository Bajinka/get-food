"use client";
import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { staffAction } from "./actions";
import QRCode from "qrcode";
export default function Form({
  action,
  children,
  submitLabel,
  disabled = false,
}: {
  action: string;
  children: React.ReactNode;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState(staffAction, {});
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (state.token)
      QRCode.toDataURL(`${location.origin}/scan/${state.token}`, {
        width: 600,
        margin: 3,
        errorCorrectionLevel: "M",
      }).then(setQr);
  }, [state.token]);
  return (
    <form action={submit} className="stack">
      <input type="hidden" name="action" value={action} />
      {children}
      <button disabled={pending || disabled}>
        {pending
          ? "Saving…"
          : (submitLabel ?? (action === "qr" ? "Generate QR code" : "Save"))}
      </button>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
      {qr && (
        <div className="card">
          <Image
            width={260}
            height={260}
            unoptimized
            src={qr}
            alt="Generated restaurant ordering QR code"
            style={{ maxWidth: 260 }}
          />
          <p>
            <a className="button" href={qr} download="get-food-qr.png">
              Download PNG
            </a>{" "}
            <button type="button" onClick={() => window.print()}>
              Print
            </button>
          </p>
          <p style={{ overflowWrap: "anywhere" }}>
            {location.origin}/scan/{state.token}
          </p>
        </div>
      )}
    </form>
  );
}
