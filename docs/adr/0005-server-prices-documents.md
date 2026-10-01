# The server prices every document

A client submits an Item, a quantity and nothing financial. Unit price, tax rate, discounts and every total are resolved on the server from the Item's price and tax assignment, and recomputed on every mutation; a stored total is a cache, never an input. A client able to send a price can forge an invoice, which is precisely the vulnerability the legacy app had: its staff order endpoints bound raw entities, so unit price and VAT rate came straight from the request body.
