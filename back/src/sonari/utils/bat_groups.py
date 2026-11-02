"""Bat species to group mapping shared by exports and bulk tag replace."""

SPECIES_TAG_KEY = "species"
GROUP_TAG_KEY = "group"

BAT_GROUPS: dict[str, str] = {
    "Pipistrellus pipistrellus": "Pipistrelloid",
    "Pipistrellus pygmaeus": "Pipistrelloid",
    "Pipistrellus nathusii": "Pipistrelloid",
    "Eptesicus serotinus": "Nyctaloid",
    "Myotis alcathoe": "Myotis",
    "Myotis mystacinus/brandtii": "Myotis",
    "Myotis brandtii": "Myotis",
    "Myotis mystacinus": "Myotis",
    "Myotis bechsteinii": "Myotis",
    "Myotis daubentonii": "Myotis",
    "Myotis myotis": "Myotis",
    "Myotis nattereri": "Myotis",
    "Nyctalus leisleri": "Nyctaloid",
    "Nyctalus noctula": "Nyctaloid",
    "Vespertilio murinus": "Nyctaloid",
    "Myotis emarginatus": "Myotis",
    "Myotis dasycneme": "Myotis",
    "Rhinolophus ferrumequinum": "Rhinolophus",
    "Rhinolophus hipposideros": "Rhinolophus",
    "Eptesicus nilsonii": "Nyctaloid",
    "Plecotus auritus": "Plecotus",
    "Plecotus austriacus": "Plecotus",
    "Plecotus auritus/austriacus": "Plecotus",
}

# Groups offered by the "replace group" tag action.
REPLACEABLE_BAT_GROUPS: tuple[str, ...] = ("Myotis", "Nyctaloid", "Pipistrelloid")


def species_in_group(group: str) -> list[str]:
    """Species tag values that belong to ``group``."""
    return [species for species, g in BAT_GROUPS.items() if g == group]
