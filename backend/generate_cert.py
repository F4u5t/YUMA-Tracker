"""Generate a self-signed TLS certificate for LAN HTTPS access."""

import os
from pathlib import Path

def generate_cert():
    cert_dir = Path(__file__).parent.parent / "certs"
    cert_dir.mkdir(exist_ok=True)
    cert_path = cert_dir / "cert.pem"
    key_path = cert_dir / "key.pem"

    if cert_path.exists() and key_path.exists():
        print(f"Certificates already exist in {cert_dir}")
        return

    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    import datetime
    import socket

    # Generate RSA key
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    # Get local hostname + IP for SAN
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except socket.gaierror:
        local_ip = "127.0.0.1"

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "faust-lawn-maintenance"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Faust Lawn Maintenance"),
    ])

    san = x509.SubjectAlternativeName([
        x509.DNSName("localhost"),
        x509.DNSName(hostname),
        x509.IPAddress(ipaddress_from_str("127.0.0.1")),
        x509.IPAddress(ipaddress_from_str(local_ip)),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
        .add_extension(san, critical=False)
        .sign(key, hashes.SHA256())
    )

    key_path.write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption())
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))

    print(f"Generated self-signed certificate in {cert_dir}")
    print(f"  CN: faust-lawn-maintenance")
    print(f"  SANs: localhost, {hostname}, 127.0.0.1, {local_ip}")


def ipaddress_from_str(ip_str: str):
    import ipaddress
    return ipaddress.ip_address(ip_str)


if __name__ == "__main__":
    generate_cert()
