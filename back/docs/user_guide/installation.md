# Installation

Getting Sonari up and running is a breeze! We offer two straightforward methods
to suit your preferences and needs.

??? note "Sonari on the cloud"

    Interested in hosting a publicly accessible and collaborative instance of
    Sonari? Let us know, and we'll be more than happy to guide you through the
    process.

## Installation Methods

### Standalone Executable

The simplest way to dive into Sonari is by downloading our pre-packaged
executable file. We've tailored versions for Windows, Mac OS, and Ubuntu. Head
over to our GitHub repository's
[releases](https://github.com/mbsantiago/sonari/releases) section to get the
latest version.

### Python Package

If you're comfortable with Python, installing Sonari as a Python package is
easy. Just run the following command:

```bash
pip install sonari
```

This should get you up and running in no time. Should you encounter any hiccups,
check out the FAQ section for troubleshooting tips.

## Running Sonari

Once you've downloaded the file, kick off Sonari by double-clicking on the
executable. This action spawns a new window that should resemble the following:

![boot](../assets/img/boot.png)

After the window displays the "ready" message a browser will be opened on
Sonari, or open your preferred browser and navigate to:

    http://localhost:5000

??? info "Start with Python"

    To start sonari using the Python installation, run the command

        python -m sonari

## First User

If this is your initial encounter with Sonari, you'll be greeted with a screen
to create your user profile. Please enter your details and set up your user
account.

!!! info "Your Information"

    The details you provide here are stored locally on your computer and are
    not shared with others. However, if you decide to download and share a dataset
    or annotations, the information of the user who created them will be visible in
    the exported files. Therefore, your data will only be shared with the people
    you send these files to. If you wish to share your work, it is essential to
    provide your information so that others can attribute you correctly and contact
    you if needed.

## Login

For returning users, Sonari welcomes you with a login form. Enter your username
and password to access the home page. Sonari's user system supports multiple
users, allowing for individual work tracking.

![login](../assets/img/login.png)

## Home Screen

Welcome to the Sonari Home screen! After logging in, your view should resemble
the image below:

![login page](../assets/img/homepage.png)

From this central hub, you're all set to dive into your audio annotation
journey. Navigate using the sidebar or the cards presented on the home page.
Whether you're managing datasets, creating annotation projects, or exploring
model predictions, the Home screen is your launchpad to your annotation work.
