package updater

const (
	UpdateProtocol     = 2
	UpdaterStateSchema = 1
)

var (
	BuildVersionValue = "dev"
	BuildTimeValue    = "unknown"
)

func BuildVersion() string {
	if BuildVersionValue == "" {
		return "dev"
	}
	return BuildVersionValue
}
