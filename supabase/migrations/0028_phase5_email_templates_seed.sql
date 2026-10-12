-- Seeds the 3 real email templates with the exact copy already live in lib/email/templates.ts
-- (byte-for-byte -- draft and live start identical, so nothing about a real customer email
-- changes until an admin edits and explicitly publishes).

insert into email_templates (key, name, subject, heading, intro_html, outro_html, draft_subject, draft_heading, draft_intro_html, draft_outro_html) values
('order_confirmation', 'Orderbekräftelse',
 'Orderbekräftelse {{orderNumber}} — Jawhara', 'Tack för din beställning!',
 '<p>Tack för din beställning! Vi har tagit emot din betalning och din order behandlas nu.</p>',
 '<p>Du får ett nytt mejl med spårningsinformation när din order har skickats.</p>',
 'Orderbekräftelse {{orderNumber}} — Jawhara', 'Tack för din beställning!',
 '<p>Tack för din beställning! Vi har tagit emot din betalning och din order behandlas nu.</p>',
 '<p>Du får ett nytt mejl med spårningsinformation när din order har skickats.</p>'
),
('shipping_confirmation', 'Leveransbekräftelse',
 'Din order {{orderNumber}} har skickats — Jawhara', 'Din order är på väg!',
 '<p>Goda nyheter — din order är på väg!</p>',
 null,
 'Din order {{orderNumber}} har skickats — Jawhara', 'Din order är på väg!',
 '<p>Goda nyheter — din order är på väg!</p>',
 null
),
('refund_notification', 'Återbetalningsbekräftelse',
 'Återbetalning för order {{orderNumber}} — Jawhara', 'Din återbetalning är bekräftad',
 '<p>Vi har återbetalat din order.</p>',
 '<p>Beloppet återförs till din ursprungliga betalningsmetod inom några bankdagar.</p>',
 'Återbetalning för order {{orderNumber}} — Jawhara', 'Din återbetalning är bekräftad',
 '<p>Vi har återbetalat din order.</p>',
 '<p>Beloppet återförs till din ursprungliga betalningsmetod inom några bankdagar.</p>'
);
