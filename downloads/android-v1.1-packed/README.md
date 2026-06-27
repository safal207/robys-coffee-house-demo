# Roby's Android package payload

The nine `a-*.txt` files contain the reviewed Roby's Coffee House v1.1 APK in a transport-safe form.

Browser and CI reconstruction contract:

1. concatenate the parts in numeric order;
2. map every `a`–`p` character pair to one byte (high and low nibbles);
3. XOR each byte with `0xA5`;
4. decompress the result as gzip;
5. require exactly `25231` bytes, the ZIP signature `PK`, and SHA-256 `f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6`.

The download button remains disabled until those checks pass in the browser. The payload is data only; it is never executed by the website.
