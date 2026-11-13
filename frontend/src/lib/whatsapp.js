export function whatsappUrl(phone, message) {
  const input = String(phone ?? "").trim().replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) & 15),
  );
  if (!/^\+?[0-9\s().-]+$/.test(input)) return null;

  let number = input.replace(/\D/g, "");
  if (input.startsWith("00")) {
    number = number.slice(2);
  } else if (input.startsWith("0")) {
    const countryCode = process.env.REACT_APP_WHATSAPP_COUNTRY_CODE || "963";
    number = countryCode.replace(/^\+/, "") + number.slice(1);
  }
  if (!/^[1-9][0-9]{6,14}$/.test(number)) return null;
  const url = `https://wa.me/${number}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}
