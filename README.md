# KVM demo

A live demo of the everyday KVM workflow: one keyboard, mouse and monitor take control of any of three workstations at any moment, and each machine keeps running while it isn't selected.

The workstations are real Linux virtual machines. A web page plays the KVM switch: click a workstation in the diagram to take control of it.

| Port | Workstation | Shows | Proof it kept running |
|---|---|---|---|
| 1 | DEV-01 | Terminal with a simulated build and `htop` | The step counter has moved on |
| 2 | OPS-02 | Monitoring dashboard | The charts and sample count have moved on |
| 3 | DOC-03 | Document in LibreOffice Writer | Your half-typed sentence is still there |

The dashboard's CPU and memory charts are real. Its requests chart is simulated and labeled that way on screen. The build on DEV-01 is also simulated.

## Requirements

- An Apple Silicon Mac. 16 GB of RAM is the target. With less, set `KVM_VM_MEM` and rehearse.
- Homebrew and internet access for installation only. The demo itself runs offline.
- About 15 GB of free disk on the build Mac.

## Build

```sh
scripts/setup      # about 25 minutes, mostly downloads; safe to re-run
```

## Moving to another Mac (optional)

The demo is built and run on the same Mac, so this is only needed if that changes. The other Mac must be Apple Silicon.

```sh
scripts/package    # on this Mac: creates dist/kvm_emulator.tar.gz
```

Copy `dist/kvm_emulator.tar.gz` and `scripts/install` to the other Mac, then run this there while it still has internet:

```sh
./install kvm_emulator.tar.gz    # installs into ~/Developer/kvm_emulator
```

## Before you present

Do this at least 5 minutes before going on stage:

1. Plug the Mac into power, and quit Docker Desktop and anything else you don't need. On 16 GB with other apps closed, a 60-minute idle run kept memory pressure normal with 65–75% free. With several apps open, pressure rose and the Mac started swapping, which is when Chrome is likeliest to blank parts of the console.
2. Run `scripts/reset` for a known starting state.
3. Run `scripts/start`. Chrome opens the console, and the Mac stays awake for as long as the console runs. The console has only been tested in Chrome.
4. Put the browser in full screen (Ctrl-Cmd-F), and hide its toolbar if it offers that.
5. Run `scripts/preflight`. It should end with `Preflight passed.`
6. Click each workstation once to check that its desktop has settled.
7. On DOC-03, click into the document and press Ctrl+End, so the cursor sits after the half-typed sentence.
8. Finish on DEV-01, ready to start.

## Demo script

About two minutes.

1. **Set the scene.** "One monitor, one keyboard, one mouse, and three separate computers. The diagram shows what's connected to the KVM, and the green line shows who's in control."
2. **Control DEV-01.** Click in the terminal's top pane and point out the step counter, or type a few characters to show the keyboard reaches this machine.
3. **Switch to OPS-02.** Click OPS-02 in the diagram. The monitor, the green cable and the port light all move. Point out that the dashboard was already running.
4. **Switch to DOC-03.** Click DOC-03 and finish typing the sentence "Next quarter we should also look at", but stop partway through.
5. **Go back to DEV-01.** The step counter has advanced, so it kept working while you were away. The thumbnails show the same thing live.
6. **Return to DOC-03.** Your half-typed sentence is exactly where you left it. Finish it.

## Things to avoid during the demo

- **Cmd shortcuts:** they go to the browser rather than the workstation. Cmd+W would close the console, and Cmd+Q would quit the browser. Use Ctrl for shortcuts inside the workstations.
- **Exiting the dashboard:** OPS-02 runs in a full-screen browser, so don't press F11 or Alt+F4 there.
- **Ctrl+C on DEV-01:** this stops the simulated build. To recover, run `scripts/reset`, then `scripts/start`.
- **A second console tab:** keep the console open in one tab only. Each tab controls its selected workstation on its own, so a stray click or keystroke in another tab still reaches that machine.
- **Other browser tabs:** keep other browsing closed. The VNC ports have no password. They only accept connections from this Mac, but a web page open in a browser here could reach them.

## If something goes wrong

| Problem | What to do |
|---|---|
| A workstation shows "No signal" | Run `scripts/start`. It restarts only what's stopped, and the console reconnects by itself |
| The keyboard does nothing | Click the workstation in the diagram again, or click inside the monitor |
| The browser tab was closed | Open `http://127.0.0.1:8080/`. The VMs are unaffected |
| Parts of a screen are missing or stuck | The console should repaint by itself within a few seconds. If it doesn't, reload the page (Cmd-R). The VMs are unaffected |
| A workstation is in a bad state | Run `scripts/reset`, then `scripts/start`. This resets all three, and takes about a minute |
| Nothing is working | Play your backup recording |

Record the backup once a rehearsal goes well (Cmd-Shift-5).

## Scripts

| Script | Purpose |
|---|---|
| `scripts/setup` | Build the three workstation disks. Needs internet |
| `scripts/package` | Optional: bundle the project and disks for another Mac |
| `scripts/install` | Optional: install that bundle on the other Mac. Needs internet |
| `scripts/start` | Boot whatever isn't running, and open the console |
| `scripts/preflight` | Check the Mac, the VMs and the console |
| `scripts/stop` | Shut everything down, keeping changes made in the VMs |
| `scripts/reset` | Shut everything down and discard those changes |

## Settings

Set these as environment variables when running the scripts.

| Variable | Default | Meaning |
|---|---|---|
| `KVM_VM_MEM` | `2048` | Memory per VM, in MiB |
| `KVM_VM_CPUS` | `2` | CPUs per VM |
| `KVM_WEB_PORT` | `8080` | Port for the console page |

## How it works

Each workstation is a QEMU VM with hardware acceleration, and its VNC server listens on localhost only. The console page holds a [noVNC](https://github.com/novnc/noVNC) connection to all three at once. Only the selected one receives input; the others are view-only, and they keep updating the thumbnails.

Disks are layered: a shared `base.qcow2`, a per-workstation disk on top, and a throwaway layer in `vm/run/` that holds changes made during the demo. `scripts/reset` deletes that top layer.

noVNC is vendored in `web/vendor/novnc` at version 1.7.0, under its own license.
