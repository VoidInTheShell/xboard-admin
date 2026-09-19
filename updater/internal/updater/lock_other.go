//go:build !linux

package updater

import "errors"

func lock(string) (func(), error) { return nil, errors.New("the host updater requires Linux") }
func secureOwner(string) error    { return errors.New("the host updater requires Linux") }
func syncParent(string) error     { return nil }
