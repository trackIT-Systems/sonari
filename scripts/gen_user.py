#!/usr/bin/env python3
import secrets
import string
import sys
import uuid
from datetime import datetime

import bcrypt


def generate_temp_password(length=12):
    """Generate a random temporary password with letters, digits, and symbols."""
    characters = string.ascii_letters + string.digits
    return "".join(secrets.choice(characters) for _ in range(length))


def hash_password(password):
    """Generate bcrypt hash for the password."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def main():
    # Check command line arguments
    if len(sys.argv) != 5:
        print("Usage: python script.py <name> <username> <email> <planner>")
        sys.exit(1)

    # Get arguments
    name = sys.argv[1]
    username = sys.argv[2]
    email = sys.argv[3]
    planner = sys.argv[4]

    # Generate temporary password
    temp_password = generate_temp_password()

    # Generate bcrypt hash
    password_hash = hash_password(temp_password)

    # Generate UUID v4
    user_id = str(uuid.uuid4())

    # Generate current timestamp in required format
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-1] + "+02"

    # Output results
    print("Info:")
    print(f"Name: {name}")
    print(f"Username: {username}")
    print(f"Email: {email}")
    print(f"Temporary Password: {temp_password}")
    print(f"Bcrypt Hash: {password_hash}")
    print(f"UUID: {user_id}")
    print(f"Timestamp: {current_time}")
    print()

    # Generate SQL INSERT statement
    sql_statement = f"""INSERT INTO "user" (email, hashed_password, username, id, name, is_active, is_superuser, is_verified, created_on) VALUES ('{email}', '{password_hash}', '{username}', '{user_id}', '{name}', true, false, false, '{current_time}');"""

    print("SQL INSERT Statement:")
    print(sql_statement)

    print()
    print("Mail:")
    print("Hallo,")
    print()
    print(f"hier sind deine Zugangsdaten zu https://{planner}.trackit-system.de/sonari/")
    print(f"Username: {username}")
    print(f"Password: {temp_password}")
    print(f"Bitte ändere das Passwort unter https://{planner}.trackit-system.de/sonari/profile/")
    print()
    print("Beste Grüße")
    print("trackIT Systems")


if __name__ == "__main__":
    main()
