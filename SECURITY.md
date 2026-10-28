# Security reports

Report a vulnerability through GitHub private vulnerability reporting when that option is available.
If it is unavailable, request a private contact channel from the maintainer.
Do not put credentials, customer data, or an active exploit in a public issue.

Include the affected version, the failure, and a small synthetic reproduction.
Explain the access that an attacker needs.
Remove private identifiers from logs and screenshots.

## Release checks

The release process runs a pinned secret scanner and the astack neutrality checks.
The owner companion adds private project and machine patterns to the local scan.
The public repository holds only the synthetic example companion.

A scan pass does not prove that an earlier commit or another export is clean.
The owner scans the exact public tree and reviews commit and tag metadata before publication.
`docs/runbooks/publish.md` describes that process.
