/**
 * Practical email shape check for sign-up and capture forms. It is deliberately
 * permissive about which characters a real local part may contain, but it does
 * not allow angle brackets or other control/markup characters, so an address
 * can never carry a chat or HTML token into a downstream sink (for example the
 * operations webhook that renders a sign-up alert as markdown).
 */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const isValidEmailAddress = (value: string): boolean =>
  value.length <= 254 && EMAIL_PATTERN.test(value);
