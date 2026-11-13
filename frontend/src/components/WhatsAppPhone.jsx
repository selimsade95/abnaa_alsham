import { whatsappUrl } from "@/lib/whatsapp";

export default function WhatsAppPhone({ phone, fallback = "—" }) {
  const href = whatsappUrl(phone);
  if (!href) return phone || fallback;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" dir="ltr"
      className="inline-block underline underline-offset-2 hover:text-accent-foreground">
      {phone}
    </a>
  );
}
