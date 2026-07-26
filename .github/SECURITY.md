# Security Policy

## Supported Versions
| Version | Supported |
|---|---|
| latest (`main`) | ✅ |

## Reporting a Vulnerability
Please **do not** open a public issue for security vulnerabilities. Instead,
report them privately:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) (Security → Report a vulnerability).

You'll get an acknowledgment within 48 hours and a resolution timeline after
triage. Please give us a reasonable window to patch before public disclosure.

## Scope Notes
NoxSafe deploys only to Ethereum Sepolia with throwaway keys — never mainnet.
The known trust boundaries and residual risks (operator authority, public float,
client-side plaintext) are documented candidly in the project `README.md`
("Honest limitations") and `SPEC.md` (invariants I1–I4).
