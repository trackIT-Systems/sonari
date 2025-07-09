import webbrowser

from colorama import Fore, Style, just_fix_windows_console
from fastapi import FastAPI

from sonari.system.database import (
    get_database_url,
    init_database,
)
from sonari.system.settings import Settings

just_fix_windows_console()


def print_ready_message(settings: Settings):
    host = settings.host
    port = settings.port

    print(
        f"""
    {Fore.GREEN}{Style.DIM}Sonari is ready to go!{Style.RESET_ALL}

    {Fore.GREEN}{Style.BRIGHT} * Listening on http://{host}:{port}/{Style.RESET_ALL}
    {Fore.CYAN}{Style.BRIGHT} * Authentication via Keycloak: {settings.keycloak_server_url}{Style.RESET_ALL}

    {Fore.YELLOW}Press Ctrl+C to exit.{Style.RESET_ALL}
    """
    )


def print_dev_message(settings: Settings):
    database_url = get_database_url(settings)
    settings_str = settings.model_dump_json(
        indent=4,
        exclude={"db_username", "db_password", "db_url", "keycloak_client_secret"},
    )
    print(
        f"""
{Fore.RED}{Style.BRIGHT}Sonari is running in development mode!{Style.RESET_ALL}

{Fore.GREEN}{Style.BRIGHT}Database URL:{Style.RESET_ALL} {database_url}

{Fore.GREEN}{Style.BRIGHT}Settings:{Style.RESET_ALL} {settings_str}
    """
    )


async def sonari_init(settings: Settings, _: FastAPI):
    """Run at initialization."""
    if settings.dev:
        print_dev_message(settings)

    print("Please wait while the database is initialized...")

    await init_database(settings)

    print_ready_message(settings)

    if settings.open_on_startup and not settings.dev:
        webbrowser.open(f"http://{settings.host}:{settings.port}/")
