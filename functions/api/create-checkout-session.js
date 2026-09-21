// =============================================
// BACKEND: Creates a Stripe Embedded Checkout session
// File location: /functions/api/create-checkout-session.js
// =============================================

import Stripe from 'stripe';

const PRICES = {
  basic: {
    label: 'Basic',
    noBoost: { deposit: 500,  monthly: 75,  total: 575  },
    boost:   { deposit: 500,  monthly: 200, total: 700  }
  },
  standard: {
    label: 'Standard',
    noBoost: { deposit: 1300, monthly: 150, total: 1450 },
    boost:   { deposit: 1300, monthly: 265, total: 1565 }
  },
  premium: {
    label: 'Premium',
    noBoost: { deposit: 2300, monthly: 300, total: 2600 },
    boost:   { deposit: 2300, monthly: 400, total: 2700 }
  }
};

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { tier, boost, businessName, clientName, clientEmail, clientPhone, clientAddress, signature } = body;

    if (!PRICES[tier]) {
      return new Response(JSON.stringify({ error: 'Invalid tier' }), { status: 400 });
    }

    const plan = PRICES[tier];
    const pricing = boost ? plan.boost : plan.noBoost;

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${plan.label} Tier — Project Deposit (50%)`,
              description: `Website design & development deposit for ${businessName}`
            },
            unit_amount: pricing.deposit * 100,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `First Month Maintenance${boost ? ' + BoostedSEO' : ''}`,
              description: `Recurring service — billed monthly beginning on delivery`
            },
            unit_amount: pricing.monthly * 100,
          },
          quantity: 1,
        },
      ],
      customer_email: clientEmail,
      metadata: {
        tier,
        boost: boost ? 'yes' : 'no',
        businessName: businessName || '',
        clientName: clientName || '',
        clientPhone: clientPhone || '',
        clientAddress: clientAddress || '',
        hasSignature: signature ? 'yes' : 'no'
      },
      return_url: `${env.SITE_URL}/Pay?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    });

    return new Response(
      JSON.stringify({ clientSecret: session.client_secret }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Stripe error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
      }
