# AeroSlate EFB 0.11.3

- Removed unsupported SimBrief `payload` and `manualpayload` query parameters.
- Corrected `cargo` to SimBrief's thousands-of-pounds API convention.
- Uses documented `acdata.paxwgt` compensation so SimBrief's visible Payload matches AeroSlate passenger plus baggage weight.
- Keeps exact AeroSlate pound values for the native form-filler and OFP display.
- Retains persistent independent green Trip buttons.
