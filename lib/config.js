// Things the seller sets once.

// Where "Make me a buddy" orders and support questions go. Empty hides the email buttons.
export const CONTACT_EMAIL = 'ayushks777@gmail.com';

// "Make me a buddy": a custom character drawn from the buyer's photos, agreed and paid by email.
export const BUDDY_PRICE = '$10';

export const BUDDY_EMAIL_SUBJECT = 'Make me a buddy';
export const BUDDY_EMAIL_BODY = `Hi! I'd like a custom Sip and Surf buddy (${BUDDY_PRICE}, one-time).

Who it's of (me, a friend, a pet):
I'm attaching 1 to 3 clear photos (face, and full body if you can).
Anything to include (glasses, hairstyle, outfit, colours):
Where I live (so we can agree how I pay):

Thanks!`;

export function mailto(subject, body = '') {
  if (!CONTACT_EMAIL) return '';
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
