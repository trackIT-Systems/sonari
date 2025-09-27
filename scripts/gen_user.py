#!/usr/bin/env python3
import argparse
import csv
import os
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


def process_user(name, username, email, planner):
    """Process a single user and return the generated data."""
    # Generate temporary password
    temp_password = generate_temp_password()

    # Generate bcrypt hash
    password_hash = hash_password(temp_password)

    # Generate UUID v4
    user_id = str(uuid.uuid4())

    # Generate current timestamp in required format
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-1] + "+02"

    return {
        "name": name,
        "username": username,
        "email": email,
        "planner": planner,
        "temp_password": temp_password,
        "password_hash": password_hash,
        "user_id": user_id,
        "current_time": current_time,
    }


def write_user_info_to_file(user_data):
    """Write user information and SQL statement to a file named after the username."""
    # Create generated_users directory if it doesn't exist
    output_dir = "generated_users"
    os.makedirs(output_dir, exist_ok=True)

    filename = os.path.join(output_dir, f"{user_data['username']}.txt")

    try:
        with open(filename, "w", encoding="utf-8") as file:
            file.write("Info:\n")
            file.write(f"Name: {user_data['name']}\n")
            file.write(f"Username: {user_data['username']}\n")
            file.write(f"Email: {user_data['email']}\n")
            file.write(f"Temporary Password: {user_data['temp_password']}\n")
            file.write(f"Bcrypt Hash: {user_data['password_hash']}\n")
            file.write(f"UUID: {user_data['user_id']}\n")
            file.write(f"Timestamp: {user_data['current_time']}\n")
            file.write("\n")

            # Generate SQL INSERT statement
            sql_statement = f"""INSERT INTO "user" (email, hashed_password, username, id, name, is_active, is_superuser, is_verified, created_on) VALUES ('{user_data["email"]}', '{user_data["password_hash"]}', '{user_data["username"]}', '{user_data["user_id"]}', '{user_data["name"]}', true, false, false, '{user_data["current_time"]}');"""

            file.write("SQL INSERT Statement:\n")
            file.write(sql_statement + "\n")
            file.write("\n")

            file.write("Mail:\n")
            file.write("Hallo,\n")
            file.write("\n")
            file.write(f"hier sind deine Zugangsdaten zu https://{user_data['planner']}.trackit-system.de/sonari/\n")
            file.write(f"Username: {user_data['username']}\n")
            file.write(f"Password: {user_data['temp_password']}\n")
            file.write(
                f"Bitte ändere das Passwort unter https://{user_data['planner']}.trackit-system.de/sonari/profile/\n"
            )
            file.write("\n")
            file.write("Beste Grüße\n")
            file.write("trackIT Systems\n")

        print(f"User information written to: {filename}")
        return filename, sql_statement

    except Exception as e:
        print(f"Error writing file {filename}: {e}")
        return None, None


def read_users_from_csv(csv_file):
    """Read users from CSV file. Expected columns: name,username,email,planner"""
    users = []
    try:
        with open(csv_file, "r", newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            expected_columns = {"name", "username", "email", "planner"}

            if not expected_columns.issubset(reader.fieldnames):
                missing = expected_columns - set(reader.fieldnames)
                print(f"Error: CSV file is missing required columns: {missing}")
                print(f"Expected columns: {expected_columns}")
                print(f"Found columns: {set(reader.fieldnames)}")
                sys.exit(1)

            for row_num, row in enumerate(reader, start=2):  # Start at 2 because row 1 is header
                # Check for empty required fields
                missing_fields = [field for field in expected_columns if not row.get(field, "").strip()]
                if missing_fields:
                    print(f"Error: Row {row_num} has empty required fields: {missing_fields}")
                    sys.exit(1)

                users.append({
                    "name": row["name"].strip(),
                    "username": row["username"].strip(),
                    "email": row["email"].strip(),
                    "planner": row["planner"].strip(),
                })

        return users
    except FileNotFoundError:
        print(f"Error: CSV file '{csv_file}' not found.")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Generate user accounts with temporary passwords",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single user via CLI
  python gen_user.py --name "John Doe" --username johndoe --email john@example.com --planner myplanner
  
  # Multiple users via CSV file
  python gen_user.py --csv users.csv
  
CSV file format (with header row):
  name,username,email,planner
  John Doe,johndoe,john@example.com,myplanner
  Jane Smith,janesmith,jane@example.com,myplanner
        """,
    )

    # Create mutually exclusive group for CLI vs CSV input
    input_group = parser.add_mutually_exclusive_group(required=True)

    # CLI arguments for single user
    input_group.add_argument(
        "--cli",
        action="store_true",
        help="Use CLI arguments for single user (requires --name, --username, --email, --planner)",
    )

    # CSV file argument
    input_group.add_argument(
        "--csv", type=str, help="CSV file containing user data (columns: name,username,email,planner)"
    )

    # Individual CLI arguments (only used with --cli)
    parser.add_argument("--name", type=str, help="Full name of the user")
    parser.add_argument("--username", type=str, help="Username for the user")
    parser.add_argument("--email", type=str, help="Email address of the user")
    parser.add_argument("--planner", type=str, help="Planner subdomain")

    args = parser.parse_args()

    # Handle CLI mode
    if args.cli:
        if not all([args.name, args.username, args.email, args.planner]):
            parser.error("--cli mode requires --name, --username, --email, and --planner arguments")

        user_data = process_user(args.name, args.username, args.email, args.planner)
        filename, sql_statement = write_user_info_to_file(user_data)
        if filename:
            print(f"✓ User '{args.username}' processed successfully")
        else:
            print(f"✗ Failed to process user '{args.username}'")

    # Handle CSV mode
    elif args.csv:
        users = read_users_from_csv(args.csv)
        print(f"Processing {len(users)} users from CSV file...\n")

        all_sql_statements = []
        created_files = []
        failed_users = []

        for i, user in enumerate(users, 1):
            print(f"Processing user {i}/{len(users)}: {user['username']}")
            user_data = process_user(user["name"], user["username"], user["email"], user["planner"])
            filename, sql_statement = write_user_info_to_file(user_data)

            if filename and sql_statement:
                all_sql_statements.append(sql_statement)
                created_files.append(filename)
                print(f"✓ User '{user['username']}' processed successfully")
            else:
                failed_users.append(user["username"])
                print(f"✗ Failed to process user '{user['username']}'")
            print()

        # Write all SQL statements to a combined file
        if all_sql_statements:
            output_dir = "generated_users"
            os.makedirs(output_dir, exist_ok=True)
            sql_batch_filename = os.path.join(output_dir, "all_users_sql_statements.sql")
            try:
                with open(sql_batch_filename, "w", encoding="utf-8") as sql_file:
                    sql_file.write("-- SQL INSERT statements for all users\n")
                    sql_file.write(f"-- Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                    sql_file.write(f"-- Total users: {len(all_sql_statements)}\n\n")

                    for sql in all_sql_statements:
                        sql_file.write(sql + "\n")

                print("=" * 60)
                print("BATCH PROCESSING SUMMARY:")
                print("=" * 60)
                print(f"✓ Successfully processed: {len(created_files)} users")
                if failed_users:
                    print(f"✗ Failed to process: {len(failed_users)} users ({', '.join(failed_users)})")
                print(f"📁 Individual user files created: {len(created_files)}")
                print(f"📄 Combined SQL file created: {os.path.basename(sql_batch_filename)}")
                print(f"\nAll files created in '{output_dir}/' directory:")
                for filename in created_files:
                    print(f"  - {os.path.basename(filename)}")
                print(f"  - {os.path.basename(sql_batch_filename)}")

            except Exception as e:
                print(f"Error creating combined SQL file: {e}")
        else:
            print("No users were successfully processed.")


if __name__ == "__main__":
    main()
