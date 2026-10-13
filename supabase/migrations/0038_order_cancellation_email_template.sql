-- Adds the 4th real transactional email: order cancellation. No cancellation email existed at
-- all before this (confirmed via grep -- app/admin/(authenticated)/orders/[id]/actions/
-- cancellation.ts never sent anything), a genuine gap rather than something being "updated".
-- New copy, since there is no existing real text to extract for this one (unlike the other 3,
-- which carried their original copy forward byte-for-byte) -- kept short and factual, matching
-- the tone of the other 3 seeded templates. Draft and live start identical, same convention.

alter table email_templates drop constraint email_templates_key_check;
alter table email_templates add constraint email_templates_key_check
  check (key in ('order_confirmation', 'shipping_confirmation', 'refund_notification', 'order_cancellation'));

insert into email_templates (key, name, subject, heading, intro_html, outro_html, draft_subject, draft_heading, draft_intro_html, draft_outro_html) values
('order_cancellation', 'Orderavbokning',
 'Din order {{orderNumber}} har avbrutits — Jawhara', 'Din order har avbrutits',
 '<p>Din order har avbrutits enligt nedan.</p>',
 '<p>Om du har betalat för ordern återbetalas beloppet separat -- du får ett eget mejl när återbetalningen är genomförd.</p>',
 'Din order {{orderNumber}} har avbrutits — Jawhara', 'Din order har avbrutits',
 '<p>Din order har avbrutits enligt nedan.</p>',
 '<p>Om du har betalat för ordern återbetalas beloppet separat -- du får ett eget mejl när återbetalningen är genomförd.</p>'
);
