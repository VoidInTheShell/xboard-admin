package main

import (
	"fmt"
	"os"

	"github.com/VoidInTheShell/xboard-admin/updater/internal/updater"
)

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: xboard-updater version|run|install|check|handoff validate|adopt")
		os.Exit(2)
	}
	if args[0] == "version" {
		if len(args) != 1 {
			fmt.Fprintln(os.Stderr, "version does not accept arguments")
			os.Exit(2)
		}
		fmt.Println(updater.BuildVersion())
		return
	}
	if args[0] == "updater" {
		args = args[1:]
	}
	if err := updater.CLI(args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
